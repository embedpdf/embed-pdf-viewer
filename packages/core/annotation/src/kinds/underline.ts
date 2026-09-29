import { defineKind, NO_CAPS } from './define';
import { MARKUP_FIELDS } from './fields';

/**
 * A line under text (`/Underline`). Bound to the text it marks: it can be selected,
 * recoloured and deleted, never moved or resized. Made from a text
 * selection, not a drag.
 */
export const underline = defineKind({
  name: 'underline',
  family: 'quads',
  caps: { ...NO_CAPS, selectable: true, anchored: true, commentable: true },
  fields: MARKUP_FIELDS,
});
