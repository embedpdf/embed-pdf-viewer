import { quadsFamily } from '../shapes';
import { defineKind, NO_CAPS } from './define';
import { MARKUP_FIELDS } from './fields';

/**
 * A line under text (`/Underline`). Bound to the text it marks: it can be selected,
 * recoloured and deleted, never moved or resized. Made from a text
 * selection, not a drag.
 */
export const underline = defineKind({
  name: 'underline',
  family: quadsFamily,
  caps: { ...NO_CAPS, paintsBeneath: true, selectable: true, anchored: true, commentable: true },
  fields: MARKUP_FIELDS,
});
