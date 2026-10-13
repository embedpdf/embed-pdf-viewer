import { textBoxFamily } from '../shapes';
import { defineKind, NO_CAPS, type AnnotationProperty, type KindCaps } from './define';
import { FONT_FAMILY, LINKABLE, OPACITY, TEXT_ALIGN } from './fields';
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
  FONT_FAMILY,
  {
    key: 'fontSize',
    control: 'number',
    label: 'Font size',
    labelKey: 'annotation.style.fontSize',
    min: 4,
    max: 96,
    step: 1,
  },
  {
    key: 'fontColor',
    control: 'color',
    label: 'Text color',
    labelKey: 'annotation.style.textColor',
  },
  {
    key: 'bold',
    control: 'textFormat',
    label: 'Bold',
    labelKey: 'annotation.style.bold',
    format: 'bold',
  },
  {
    key: 'italic',
    control: 'textFormat',
    label: 'Italic',
    labelKey: 'annotation.style.italic',
    format: 'italic',
  },
  {
    key: 'underline',
    control: 'textFormat',
    label: 'Underline',
    labelKey: 'annotation.style.underline',
    format: 'underline',
  },
  TEXT_ALIGN,
  OPACITY,
  {
    key: 'interiorColor',
    control: 'color',
    label: 'Background',
    labelKey: 'annotation.style.background',
  },
  { key: 'color', control: 'color', label: 'Border', labelKey: 'annotation.style.border' },
  {
    key: 'strokeWidth',
    control: 'number',
    label: 'Border width',
    labelKey: 'annotation.style.borderWidth',
    min: 0,
    max: 12,
    step: 0.5,
  },
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
