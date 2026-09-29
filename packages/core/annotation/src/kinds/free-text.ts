import { textBoxFamily } from '../shapes';
import { defineKind, NO_CAPS } from './define';
import { LINKABLE, OPACITY } from './fields';

/**
 * A text box (`/FreeText`), plain or with a callout line. Its box resizes and
 * its text reflows; its text is edited in place. The sidebar lists the font
 * first (the text is what it is for), then the box's background and border.
 */
export const freeText = defineKind({
  name: 'free-text',
  family: textBoxFamily,
  caps: {
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
  },
  fields: [
    { key: 'fontFamily', label: 'Font' },
    { key: 'fontSize', label: 'Font size', min: 4, max: 96, step: 1 },
    { key: 'fontColor', label: 'Text color' },
    { key: 'bold', label: 'Bold' },
    { key: 'italic', label: 'Italic' },
    { key: 'underline', label: 'Underline' },
    { key: 'textAlign', label: 'Align' },
    OPACITY,
    { key: 'interiorColor', label: 'Background' },
    { key: 'color', label: 'Border' },
    { key: 'strokeWidth', label: 'Border width', min: 0, max: 12, step: 0.5 },
    LINKABLE,
  ],
});
